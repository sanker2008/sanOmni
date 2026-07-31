/// A successful push appends server versions, but does not mean this client has
/// consumed every version that preceded its own changes.
pub fn pull_start_after_push(last_pulled_version: i64, _pushed_server_version: i64) -> i64 {
    last_pulled_version
}

/// A snapshot gap means the incremental cursor no longer describes the local
/// database completely. Replay the retained server history from the origin so
/// missing records and their file hashes can be recovered through the normal
/// transactional Pull path.
pub fn pull_start_after_reconciliation(
    last_pulled_version: i64,
    missing_remote_records: usize,
) -> i64 {
    if missing_remote_records > 0 {
        0
    } else {
        last_pulled_version
    }
}

pub fn ensure_complete_pull(applied: usize, received: usize) -> Result<(), String> {
    if applied == received {
        Ok(())
    } else {
        Err(format!(
            "本地仅成功应用 {} / {} 条远端变更，同步游标未推进",
            applied, received
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_does_not_advance_the_last_pulled_cursor() {
        assert_eq!(pull_start_after_push(10, 12), 10);
    }

    #[test]
    fn partial_pull_must_not_be_committed_or_advance_cursor() {
        assert!(ensure_complete_pull(2, 3).is_err());
        assert!(ensure_complete_pull(3, 3).is_ok());
    }

    #[test]
    fn historical_snapshot_gap_restarts_pull_from_origin() {
        assert_eq!(pull_start_after_reconciliation(3474, 3), 0);
        assert_eq!(pull_start_after_reconciliation(3474, 0), 3474);
    }
}
