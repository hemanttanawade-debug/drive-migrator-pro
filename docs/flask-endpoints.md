# Flask endpoints used by the frontend

Existing endpoints (already implemented in `flask-backend`) are marked ✅.
Endpoints marked 🆕 are **assumed** by the frontend and need to be added.

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| POST   | `/api/auth/verify` | Verify Google ID token | ✅ |
| POST   | `/api/config/new` | Start a new wizard session | ✅ |
| POST   | `/api/config` | Save domain config + credential JSONs | ✅ |
| POST   | `/api/validate` | Test source/dest connectivity | ✅ |
| POST   | `/api/user-mapping` | Upload `users.csv` | ✅ |
| POST   | `/api/shared-drive-mapping` | Upload `shared_drives.csv` | 🆕 |
| POST   | `/api/storage-sizes` | Fetch per-user Drive size via Admin SDK | 🆕 |
| POST   | `/api/migration-mode` | Save chosen mode | ✅ |
| POST   | `/api/scan` | Walk source and persist totals to SQL | 🆕 |
| POST   | `/api/migrate` | Start migration | ✅ |
| GET    | `/api/migration/<id>/status` | Poll status + logs | ✅ |
| GET    | `/api/migration/<id>/logs` | Last N log lines | ✅ |
| GET    | `/api/migration/<id>/logs/download` | Download `migration.log` (text) | 🆕 |
| GET    | `/api/migration/<id>/report?format=csv` | Download report as CSV | 🆕 (JSON exists) |
| POST   | `/api/migration/<id>/retry` | Retry failed files | ✅ |
| GET    | `/api/dashboard` | Per-user progress rows + aggregates | 🆕 |
| DELETE | `/api/migration/<id>/cleanup` | Delete uploaded files | ✅ |
| DELETE | `/api/migration/<id>/purge` | Delete EVERYTHING (uploads, SQL, GCS, reports) | 🆕 |

## CSV formats

- `users.csv`        → `source,destination` (emails)
- `shared_drives.csv` → `source,destination` (Drive IDs)

The Flask layer is expected to merge these into the canonical
`uploads/<sessionId>/migration_map.csv` with columns:

```
source,destination,source_drive_id,dest_drive_id
```

For "My Drive only" runs `source_drive_id` and `dest_drive_id` are blank.
For "Shared Drives only" runs `source` and `destination` are blank.

## /api/scan response

```json
{
  "totalFiles": 14420,
  "totalFolders": 982,
  "totalSizeGb": 51.5,
  "estimateDays": 0,
  "estimateHours": 6
}
```

## /api/dashboard response

```json
{
  "totalUsers": 7,
  "completed": 2,
  "inProgress": 2,
  "failed": 1,
  "filesMigrated": 4885,
  "filesTotal": 14420,
  "dataTransferredGb": 17.1,
  "dataTotalGb": 51.5,
  "rows": [
    {
      "sourceUser": "alice@source.com",
      "destinationUser": "alice@dest.com",
      "status": "completed",
      "progressPct": 100,
      "filesDone": 1240, "filesTotal": 1240, "filesFailed": 0,
      "sizeDoneGb": 4.2, "sizeTotalGb": 4.2
    }
  ]
}
```
