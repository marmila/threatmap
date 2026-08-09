# MongoDB Backup & Restore

Covers full backup and restore of the threatmap MongoDB instance running in Kubernetes.

---

## Variables (set once, reuse everywhere)

```bash
NS=threatmap
PASS=$(kubectl get secret threatmap-secrets -n $NS -o jsonpath='{.data.password}' | base64 -d)
URI="mongodb://threatmap:${PASS}@localhost:27017/threatmap?authSource=threatmap"
```

---

## Backup

### 1. Scale down the backend (stops writes — guarantees consistent snapshot)

```bash
kubectl scale deployment threatmap-backend -n $NS --replicas=0
kubectl rollout status deployment/threatmap-backend -n $NS
```

### 2. Dump to a local file

```bash
BACKUP="threatmap-$(date +%Y%m%d-%H%M%S).archive.gz"

kubectl exec -n $NS mongodb-0 -c mongod -- \
  mongodump --uri="$URI" --archive --gzip > $BACKUP
```

### 3. Scale the backend back up

```bash
kubectl scale deployment threatmap-backend -n $NS --replicas=1
```

### 4. Verify the backup file

```bash
ls -lh $BACKUP
```

> Expected size: ~58MB compressed for ~460k events + ip_cache.

---

## Restore

> **Do not pipe the file via stdin** — `kubectl exec` stdin times out on large files.
> Copy the file into the pod first, then restore from inside.

### 1. Scale down the backend

```bash
kubectl scale deployment threatmap-backend -n $NS --replicas=0
kubectl rollout status deployment/threatmap-backend -n $NS
```

### 2. Copy the backup into the pod

```bash
BACKUP="threatmap-20260712-170000.archive.gz"   # your actual filename

kubectl cp $BACKUP $NS/mongodb-0:/tmp/restore.archive.gz -c mongod
```

### 3. Restore from inside the pod

```bash
kubectl exec -n $NS mongodb-0 -c mongod -- \
  mongorestore --uri="$URI" --archive=/tmp/restore.archive.gz --gzip --drop
```

`--drop` drops each collection right before restoring it — the DB is never fully empty, so a mid-restore failure leaves partial data rather than nothing.

### 4. Cleanup the temp file

```bash
kubectl exec -n $NS mongodb-0 -c mongod -- rm /tmp/restore.archive.gz
```

### 5. Scale the backend back up

```bash
kubectl scale deployment threatmap-backend -n $NS --replicas=1
```

### 6. Verify

```bash
kubectl logs -n $NS deployment/threatmap-backend --tail=30
```

Look for `MongoDB indexes ensured` and `Stats counters already initialized` — confirms data and materialized counters are intact.
