#!/usr/bin/env bash
# Launch per-round re-runs for the site in the background; survives ssh exit.
cd /home/lzf/mount/bubble_hl_sac_demo
nohup bash -c 'bash remote_run.sh /tmp/rerun_rounds.py hl_h200_nohint_stat01 8; bash remote_run.sh /tmp/rerun_rounds.py hl_h200_nohint_stat02 8' > /tmp/hl_site_rounds.log 2>&1 &
pid=$!
sleep 3
kill -0 $pid && echo "started $pid" || { echo "failed"; cat /tmp/hl_site_rounds.log; }
