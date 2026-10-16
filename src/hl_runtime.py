"""Bounded Python-subset interpreter; not a general-purpose Python sandbox."""
import ast
import copy
import math
import operator


class PolicyError(ValueError):
    pass


FUNCTIONS = {'abs': abs, 'min': min, 'max': max, 'sum': sum, 'len': len,
             'sin': math.sin, 'cos': math.cos, 'sqrt': math.sqrt,
             'tanh': math.tanh, 'exp': math.exp}
BINARY = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
          ast.Div: operator.truediv, ast.Mod: operator.mod}
COMPARE = {ast.Lt: operator.lt, ast.LtE: operator.le, ast.Gt: operator.gt,
           ast.GtE: operator.ge, ast.Eq: operator.eq, ast.NotEq: operator.ne}
ALLOWED = (ast.Module, ast.Assign, ast.If, ast.For, ast.Expr, ast.Name, ast.Load,
           ast.Store, ast.Constant, ast.List, ast.Dict, ast.Subscript, ast.BinOp,
           ast.UnaryOp, ast.USub, ast.UAdd, ast.Not, ast.BoolOp, ast.And, ast.Or,
           ast.Compare, ast.Call, ast.IfExp, *BINARY, *COMPARE)


def bounded(value, depth=0):
    if depth > 5:
        raise PolicyError('State nesting exceeds 5')
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        if not math.isfinite(value) or abs(value) > 1e12:
            raise PolicyError('Nonfinite or oversized value')
        return value
    if isinstance(value, str) and len(value) <= 64:
        return value
    if isinstance(value, (dict, list)) and len(value) <= 128:
        if isinstance(value, dict):
            for key in value:
                if not isinstance(key, str) or len(key) > 64:
                    raise PolicyError('Memory keys must be short strings')
            items = value.values()
        else:
            items = value
        for item in items:
            bounded(item, depth+1)
        return value
    raise PolicyError('Unsupported or oversized value')


class CodePolicy:
    def __init__(self, source, interval=0.1, budget=5000):
        if len(source.encode()) > 16000:
            raise PolicyError('Source exceeds 16 KB')
        self.tree = ast.parse(source)
        nodes = list(ast.walk(self.tree))
        if len(nodes) > 1500:
            raise PolicyError('Program too large')
        for node in nodes:
            if not isinstance(node, ALLOWED):
                raise PolicyError('Unsupported syntax: '+type(node).__name__)
            if isinstance(node, ast.Name) and node.id.startswith('_'):
                raise PolicyError('Private names forbidden')
            if isinstance(node, ast.Call):
                if not isinstance(node.func, ast.Name) or node.func.id not in (*FUNCTIONS, 'range') or node.keywords:
                    raise PolicyError('Call not permitted')
            if isinstance(node, ast.Assign) and len(node.targets) != 1:
                raise PolicyError('Use single assignment targets')
            if isinstance(node, ast.For) and (not isinstance(node.target, ast.Name) or node.orelse):
                raise PolicyError('Use simple bounded for loops')
        self.interval, self.budget = interval, budget
        self.reset()

    def reset(self):
        self.memory = {}
        self.steps = 0

    def tick(self):
        self.remaining -= 1
        if self.remaining < 0:
            raise PolicyError('Instruction budget exceeded')

    def expression(self, node):
        self.tick()
        result = self.compute(node)
        return bounded(result)

    def compute(self, node):
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return self.values[node.id]
        if isinstance(node, ast.List):
            return [self.expression(item) for item in node.elts]
        if isinstance(node, ast.Dict):
            return {self.expression(key): self.expression(value) for key, value in zip(node.keys, node.values)}
        if isinstance(node, ast.Subscript):
            return self.expression(node.value)[self.expression(node.slice)]
        if isinstance(node, ast.BinOp):
            left, right = self.expression(node.left), self.expression(node.right)
            if not isinstance(left, (int, float)) or not isinstance(right, (int, float)):
                raise PolicyError('Arithmetic only on numbers')
            return BINARY[type(node.op)](left, right)
        if isinstance(node, ast.UnaryOp):
            value = self.expression(node.operand)
            return {ast.USub: operator.neg, ast.UAdd: operator.pos, ast.Not: operator.not_}[type(node.op)](value)
        if isinstance(node, ast.BoolOp):
            for child in node.values:
                value = self.expression(child)
                if isinstance(node.op, ast.And) and not value:
                    return value
                if isinstance(node.op, ast.Or) and value:
                    return value
            return value
        if isinstance(node, ast.Compare):
            left = self.expression(node.left)
            for operation, child in zip(node.ops, node.comparators):
                right = self.expression(child)
                if not COMPARE[type(operation)](left, right):
                    return False
                left = right
            return True
        if isinstance(node, ast.IfExp):
            return self.expression(node.body if self.expression(node.test) else node.orelse)
        if isinstance(node, ast.Call):
            args = [self.expression(item) for item in node.args]
            if node.func.id == 'range':
                sequence = range(*args)
                if len(sequence) > 128:
                    raise PolicyError('Loop bound exceeds 128')
                return list(sequence)
            return FUNCTIONS[node.func.id](*args)
        raise PolicyError('Unsupported expression')

    def assign(self, target, value):
        if isinstance(target, ast.Name):
            if target.id in ('obs', 'dt', 'step', 'pi', *FUNCTIONS, 'range'):
                raise PolicyError('Read-only name')
            self.values[target.id] = value
        elif isinstance(target, ast.Subscript):
            base = self.expression(target.value)
            base[self.expression(target.slice)] = value
            bounded(base)
        else:
            raise PolicyError('Assignment target not permitted')

    def statements(self, nodes):
        for node in nodes:
            self.tick()
            if isinstance(node, ast.Assign):
                self.assign(node.targets[0], self.expression(node.value))
            elif isinstance(node, ast.If):
                self.statements(node.body if self.expression(node.test) else node.orelse)
            elif isinstance(node, ast.For):
                for value in self.expression(node.iter):
                    self.assign(node.target, value)
                    self.statements(node.body)
            elif isinstance(node, ast.Expr):
                self.expression(node.value)
            else:
                raise PolicyError('Unsupported statement')

    def __call__(self, observation):
        if len(observation) != 21:
            raise PolicyError('Expected 21 observations')
        self.remaining = self.budget
        self.values = {'obs': [float(value) for value in observation], 'memory': copy.deepcopy(self.memory),
                       'step': self.steps, 'dt': self.interval, 'pi': math.pi}
        bounded(self.values['obs'])
        try:
            self.statements(self.tree.body)
            action = self.values['action']
            if not isinstance(action, list) or len(action) != 3:
                raise PolicyError('Output action must be a list of length 3')
            if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not -1 <= value <= 1 for value in action):
                raise PolicyError('Actions must be finite numbers within [-1,1]')
            memory = bounded(self.values['memory'])
            if not isinstance(memory, dict):
                raise PolicyError('Memory must remain a dictionary')
            self.memory = copy.deepcopy(memory)
            self.steps += 1
            return action
        except (ArithmeticError, KeyError, IndexError, TypeError) as error:
            raise PolicyError(type(error).__name__) from error


BASELINE = 'action = [0.0, 0.0, 0.0]\n'