import gymnasium as gym
import numpy as np
from stable_baselines3 import SAC

class TimeHistoryEnv(gym.Wrapper):
    def __init__(self, env, history=4):
        super().__init__(env)
        self.history = history
        self.single = env.observation_space.shape[0]
        self.observation_space = gym.spaces.Box(-np.inf, np.inf,
            (history * self.single + 1,), dtype=np.float32)
        self.buffer = None
        self.elapsed = 0.0

    @property
    def case(self):
        return self.env.case

    def _augment(self, observation):
        self.buffer = np.roll(self.buffer, -self.single)
        self.buffer[-self.single:] = observation
        return np.concatenate([self.buffer, [self.elapsed / (self.horizon * self.interval)]]).astype(np.float32)

    def reset(self, **kwargs):
        observation, info = self.env.reset(**kwargs)
        self.horizon, self.interval = self.env.horizon, self.env.interval
        self.elapsed = 0.0
        self.buffer = np.tile(observation, self.history).astype(np.float32)
        return self._augment(observation), info

    def step(self, action):
        observation, reward, terminated, truncated, info = self.env.step(action)
        self.elapsed += self.interval
        return self._augment(observation), reward, terminated, truncated, info


def make_sac(env, seed=0, learning_starts=250, batch_size=64,
             buffer_size=50000, net_arch=(64, 64)):
    return SAC('MlpPolicy', env, seed=seed, learning_starts=learning_starts,
               batch_size=batch_size,
               buffer_size=buffer_size, train_freq=1, gradient_steps=1,
               policy_kwargs={'net_arch': list(net_arch)}, device='cpu', verbose=0)