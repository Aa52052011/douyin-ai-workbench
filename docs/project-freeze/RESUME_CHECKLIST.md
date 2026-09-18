# Resume checklist

Operator checklist after pause. Tick in order.

## Local restore

- [ ] Git HEAD is `f09109fd9bf94767ee2fc8f82a4e127346d9b980`
- [ ] `v0.9.1-rc.1` peeled = same HEAD
- [ ] `v0.9.0-rc.1` peeled = `296e6d8c148eb77df16b5fc18b709262cf197009`
- [ ] Working tree reviewed (clean, or freeze docs only)
- [ ] PostgreSQL `127.0.0.1:55432` reachable
- [ ] Prisma migrate status CLEAN (no deploy)
- [ ] Redis/Memurai `127.0.0.1:6379` reachable
- [ ] Backend `GET http://127.0.0.1:3001/health` 200
- [ ] Worker count 1 (`dist\worker.js`)
- [ ] Frontend `http://127.0.0.1:3010/` reachable
- [ ] Validation project `01a0b275-b904-7492-a5a3-185430e1d585` exists
- [ ] ContentPlan v2 `01a0b299-d07d-77f1-b2f0-db14777451c3` still CONFIRMED
- [ ] Pause dump exists under `D:\acf-backups\checkpoints\`
- [ ] Pause dump SHA256 matches sidecar
- [ ] Release dump still at `D:\acf-backups\releases\acf_dev_v0.9.0-rc.1_validation-baseline_20260918.dump`

## External (required before II-A.6)

- [ ] VPS prepared
- [ ] Domain prepared
- [ ] DNS access prepared
- [ ] HTTPS path understood (Certbot not run until rehearsal)
- [ ] Ready for II-A.6

If any local box fails: STOP. Do not migrate and do not rebuild validation data.
