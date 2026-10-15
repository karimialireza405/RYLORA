//! The play queue: ordering, shuffle and repeat rules.
//!
//! `entries` is always the *play order*. When shuffle is enabled the
//! pre-shuffle order is kept in `original` so turning shuffle off restores the
//! order the user chose. Every entry carries a queue-unique `uid` so the same
//! track can appear more than once and still be addressed unambiguously.

use serde::Serialize;

use super::models::{RepeatMode, TrackId};
use super::rng::SplitMix64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueEntry {
    pub uid: u64,
    pub track_id: TrackId,
}

/// Why the queue is being advanced. Repeat-one only holds for natural track ends;
/// an explicit "next" from the user always moves on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Advance {
    TrackEnded,
    UserSkip,
}

#[derive(Debug, Default)]
pub struct PlayQueue {
    entries: Vec<QueueEntry>,
    original: Option<Vec<QueueEntry>>,
    cursor: Option<usize>,
    repeat: RepeatMode,
    next_uid: u64,
}

impl PlayQueue {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn entries(&self) -> &[QueueEntry] {
        &self.entries
    }

    pub fn cursor(&self) -> Option<usize> {
        self.cursor
    }

    pub fn current(&self) -> Option<QueueEntry> {
        self.cursor.and_then(|i| self.entries.get(i).copied())
    }

    pub fn repeat(&self) -> RepeatMode {
        self.repeat
    }

    pub fn set_repeat(&mut self, mode: RepeatMode) {
        self.repeat = mode;
    }

    pub fn shuffled(&self) -> bool {
        self.original.is_some()
    }

    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    fn make_entries(&mut self, ids: &[TrackId]) -> Vec<QueueEntry> {
        ids.iter()
            .map(|&track_id| {
                self.next_uid += 1;
                QueueEntry { uid: self.next_uid, track_id }
            })
            .collect()
    }

    /// Replace the queue with `ids`, positioned at `start`. When shuffle is on the
    /// chosen track plays first and the remainder is shuffled.
    pub fn replace(&mut self, ids: &[TrackId], start: usize, rng: &mut SplitMix64) {
        let entries = self.make_entries(ids);
        let start = start.min(entries.len().saturating_sub(1));
        self.entries = entries;
        self.cursor = if self.entries.is_empty() { None } else { Some(start) };
        if self.original.is_some() {
            self.original = Some(self.entries.clone());
            self.shuffle_around_current(rng);
        }
    }

    /// Restore a persisted session without re-shuffling.
    pub fn restore(&mut self, ids: &[TrackId], cursor: Option<usize>) {
        self.entries = self.make_entries(ids);
        self.original = None;
        self.cursor = cursor.filter(|&c| c < self.entries.len());
    }

    pub fn set_shuffle(&mut self, enabled: bool, rng: &mut SplitMix64) {
        match (enabled, self.original.is_some()) {
            (true, false) => {
                self.original = Some(self.entries.clone());
                self.shuffle_around_current(rng);
            }
            (false, true) => {
                let current = self.current();
                self.entries = self.original.take().unwrap_or_default();
                self.cursor = current.and_then(|c| self.position_of(c.uid));
            }
            _ => {}
        }
    }

    /// Move the current entry to the front and shuffle everything after it.
    fn shuffle_around_current(&mut self, rng: &mut SplitMix64) {
        if let Some(i) = self.cursor {
            let current = self.entries.remove(i);
            rng.shuffle(&mut self.entries);
            self.entries.insert(0, current);
            self.cursor = Some(0);
        } else {
            rng.shuffle(&mut self.entries);
        }
    }

    fn position_of(&self, uid: u64) -> Option<usize> {
        self.entries.iter().position(|e| e.uid == uid)
    }

    /// Compute and move to the next entry. Returns `None` at the end of the queue.
    pub fn advance(&mut self, reason: Advance) -> Option<QueueEntry> {
        let cursor = self.cursor?;
        if reason == Advance::TrackEnded && self.repeat == RepeatMode::One {
            return self.current();
        }
        let next = if cursor + 1 < self.entries.len() {
            cursor + 1
        } else if self.repeat != RepeatMode::Off && !self.entries.is_empty() {
            0
        } else {
            return None;
        };
        self.cursor = Some(next);
        self.current()
    }

    /// Step back one entry, wrapping only when repeat is enabled.
    pub fn retreat(&mut self) -> Option<QueueEntry> {
        let cursor = self.cursor?;
        let prev = if cursor > 0 {
            cursor - 1
        } else if self.repeat != RepeatMode::Off {
            self.entries.len().checked_sub(1)?
        } else {
            return None;
        };
        self.cursor = Some(prev);
        self.current()
    }

    pub fn jump_to(&mut self, uid: u64) -> Option<QueueEntry> {
        let i = self.position_of(uid)?;
        self.cursor = Some(i);
        self.current()
    }

    /// Insert tracks to play immediately after the current one.
    pub fn play_next(&mut self, ids: &[TrackId]) {
        let new = self.make_entries(ids);
        let at = self.cursor.map_or(self.entries.len(), |c| c + 1);
        if let Some(original) = self.original.as_mut() {
            let current_uid = self.cursor.and_then(|c| self.entries.get(c)).map(|e| e.uid);
            let orig_at = current_uid
                .and_then(|uid| original.iter().position(|e| e.uid == uid))
                .map_or(original.len(), |p| p + 1);
            original.splice(orig_at..orig_at, new.iter().copied());
        }
        self.entries.splice(at..at, new);
    }

    /// Append tracks to the end of the queue.
    pub fn append(&mut self, ids: &[TrackId]) {
        let new = self.make_entries(ids);
        if let Some(original) = self.original.as_mut() {
            original.extend(new.iter().copied());
        }
        self.entries.extend(new);
    }

    /// Remove an entry. Returns `true` when the removed entry was the current one,
    /// in which case the cursor now points at the entry that followed it (if any).
    pub fn remove(&mut self, uid: u64) -> bool {
        if let Some(original) = self.original.as_mut() {
            original.retain(|e| e.uid != uid);
        }
        let Some(i) = self.position_of(uid) else { return false };
        self.entries.remove(i);
        match self.cursor {
            Some(c) if c == i => {
                self.cursor = if i < self.entries.len() { Some(i) } else { None };
                true
            }
            Some(c) if c > i => {
                self.cursor = Some(c - 1);
                false
            }
            _ => false,
        }
    }

    /// Remove every entry referencing a track (e.g. when it disappears from disk).
    pub fn remove_track(&mut self, track_id: TrackId) -> bool {
        let uids: Vec<u64> = self.entries.iter().filter(|e| e.track_id == track_id).map(|e| e.uid).collect();
        // Every matching entry must be removed, so no short-circuiting here.
        let mut removed_current = false;
        for uid in uids {
            removed_current |= self.remove(uid);
        }
        removed_current
    }

    /// Move an entry to a new play-order index, keeping the cursor on the same entry.
    pub fn move_entry(&mut self, uid: u64, to: usize) -> bool {
        let Some(from) = self.position_of(uid) else { return false };
        let to = to.min(self.entries.len() - 1);
        if from == to {
            return true;
        }
        let current_uid = self.current().map(|e| e.uid);
        let entry = self.entries.remove(from);
        self.entries.insert(to, entry);
        self.cursor = current_uid.and_then(|u| self.position_of(u));
        true
    }

    /// Drop everything except the current entry.
    pub fn clear_upcoming(&mut self) {
        match self.current() {
            Some(current) => {
                self.entries = vec![current];
                self.cursor = Some(0);
                if self.original.is_some() {
                    self.original = Some(vec![current]);
                }
            }
            None => self.clear(),
        }
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.cursor = None;
        if self.original.is_some() {
            self.original = Some(Vec::new());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(q: &PlayQueue) -> Vec<TrackId> {
        q.entries().iter().map(|e| e.track_id).collect()
    }

    fn queue_of(n: i64, start: usize) -> (PlayQueue, SplitMix64) {
        let mut q = PlayQueue::new();
        let mut rng = SplitMix64::new(42);
        let tracks: Vec<TrackId> = (1..=n).collect();
        q.replace(&tracks, start, &mut rng);
        (q, rng)
    }

    #[test]
    fn advances_in_order_and_stops_at_end() {
        let (mut q, _) = queue_of(3, 0);
        assert_eq!(q.current().unwrap().track_id, 1);
        assert_eq!(q.advance(Advance::UserSkip).unwrap().track_id, 2);
        assert_eq!(q.advance(Advance::TrackEnded).unwrap().track_id, 3);
        assert!(q.advance(Advance::TrackEnded).is_none());
        assert_eq!(q.current().unwrap().track_id, 3, "cursor stays on last entry");
    }

    #[test]
    fn repeat_all_wraps_both_directions() {
        let (mut q, _) = queue_of(3, 2);
        q.set_repeat(RepeatMode::All);
        assert_eq!(q.advance(Advance::TrackEnded).unwrap().track_id, 1);
        assert_eq!(q.retreat().unwrap().track_id, 3);
    }

    #[test]
    fn retreat_without_repeat_stops_at_start() {
        let (mut q, _) = queue_of(3, 0);
        assert!(q.retreat().is_none());
        assert_eq!(q.current().unwrap().track_id, 1);
    }

    #[test]
    fn repeat_one_holds_on_track_end_but_not_on_skip() {
        let (mut q, _) = queue_of(3, 1);
        q.set_repeat(RepeatMode::One);
        assert_eq!(q.advance(Advance::TrackEnded).unwrap().track_id, 2);
        assert_eq!(q.advance(Advance::UserSkip).unwrap().track_id, 3);
    }

    #[test]
    fn shuffle_keeps_current_first_and_is_a_permutation() {
        let (mut q, mut rng) = queue_of(20, 7);
        q.set_shuffle(true, &mut rng);
        assert_eq!(q.cursor(), Some(0));
        assert_eq!(q.current().unwrap().track_id, 8);
        let mut sorted = ids(&q);
        assert_ne!(sorted, (1..=20).collect::<Vec<_>>(), "order should change");
        sorted.sort();
        assert_eq!(sorted, (1..=20).collect::<Vec<_>>());
    }

    #[test]
    fn unshuffle_restores_original_order_and_cursor() {
        let (mut q, mut rng) = queue_of(10, 3);
        q.set_shuffle(true, &mut rng);
        q.advance(Advance::UserSkip);
        let playing = q.current().unwrap();
        q.set_shuffle(false, &mut rng);
        assert_eq!(ids(&q), (1..=10).collect::<Vec<_>>());
        assert_eq!(q.current().unwrap(), playing);
    }

    #[test]
    fn play_next_inserts_after_current_in_both_orders() {
        let (mut q, mut rng) = queue_of(5, 1);
        q.play_next(&[99]);
        assert_eq!(ids(&q), vec![1, 2, 99, 3, 4, 5]);
        q.set_shuffle(true, &mut rng);
        q.play_next(&[77]);
        assert_eq!(q.entries()[1].track_id, 77);
        q.set_shuffle(false, &mut rng);
        assert_eq!(ids(&q), vec![1, 2, 77, 99, 3, 4, 5]);
    }

    #[test]
    fn removing_current_points_at_following_entry() {
        let (mut q, _) = queue_of(3, 1);
        let uid = q.current().unwrap().uid;
        assert!(q.remove(uid));
        assert_eq!(q.current().unwrap().track_id, 3);
    }

    #[test]
    fn removing_last_current_entry_clears_cursor() {
        let (mut q, _) = queue_of(2, 1);
        let uid = q.current().unwrap().uid;
        assert!(q.remove(uid));
        assert!(q.current().is_none());
    }

    #[test]
    fn removing_earlier_entry_shifts_cursor() {
        let (mut q, _) = queue_of(4, 2);
        let first = q.entries()[0].uid;
        assert!(!q.remove(first));
        assert_eq!(q.current().unwrap().track_id, 3);
        assert_eq!(q.cursor(), Some(1));
    }

    #[test]
    fn duplicates_are_addressed_by_uid() {
        let mut q = PlayQueue::new();
        let mut rng = SplitMix64::new(1);
        q.replace(&[5, 5, 5], 0, &mut rng);
        let second = q.entries()[1].uid;
        q.remove(second);
        assert_eq!(q.entries().len(), 2);
        assert!(q.remove_track(5));
        assert!(q.is_empty());
    }

    #[test]
    fn move_entry_keeps_cursor_on_same_track() {
        let (mut q, _) = queue_of(5, 1);
        let last = q.entries()[4].uid;
        q.move_entry(last, 0);
        assert_eq!(ids(&q), vec![5, 1, 2, 3, 4]);
        assert_eq!(q.current().unwrap().track_id, 2);
    }

    #[test]
    fn clear_upcoming_keeps_only_current() {
        let (mut q, mut rng) = queue_of(5, 2);
        q.set_shuffle(true, &mut rng);
        q.clear_upcoming();
        assert_eq!(ids(&q), vec![3]);
        q.set_shuffle(false, &mut rng);
        assert_eq!(ids(&q), vec![3]);
        assert_eq!(q.cursor(), Some(0));
    }

    #[test]
    fn replace_clamps_start_and_handles_empty() {
        let mut q = PlayQueue::new();
        let mut rng = SplitMix64::new(3);
        q.replace(&[], 4, &mut rng);
        assert!(q.current().is_none());
        q.replace(&[1, 2], 9, &mut rng);
        assert_eq!(q.current().unwrap().track_id, 2);
    }
}
