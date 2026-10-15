//! A pass-through [`Source`] that copies a mono downmix of the decoded audio into a
//! shared ring buffer for the spectrum analyser. It never blocks the audio thread:
//! samples are batched locally and handed over with `try_lock`.

use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use rodio::source::SeekError;
use rodio::{ChannelCount, Sample, SampleRate, Source};

use super::spectrum::SampleRing;

const BATCH: usize = 512;

pub struct TapSource<S: Source> {
    inner: S,
    ring: Arc<Mutex<SampleRing>>,
    batch: Vec<f32>,
    frame_acc: f32,
    frame_pos: u16,
}

impl<S: Source> TapSource<S> {
    pub fn new(inner: S, ring: Arc<Mutex<SampleRing>>) -> Self {
        {
            let mut r = ring.lock();
            r.clear();
            r.sample_rate = inner.sample_rate().get();
        }
        Self { inner, ring, batch: Vec::with_capacity(BATCH), frame_acc: 0.0, frame_pos: 0 }
    }

    fn flush(&mut self) {
        if let Some(mut ring) = self.ring.try_lock() {
            ring.push_slice(&self.batch);
        }
        self.batch.clear();
    }
}

impl<S: Source> Iterator for TapSource<S> {
    type Item = Sample;

    #[inline]
    fn next(&mut self) -> Option<Sample> {
        let sample = self.inner.next()?;
        let channels = self.inner.channels().get();
        self.frame_acc += sample;
        self.frame_pos += 1;
        if self.frame_pos >= channels {
            self.batch.push(self.frame_acc / channels as f32);
            self.frame_acc = 0.0;
            self.frame_pos = 0;
            if self.batch.len() >= BATCH {
                self.flush();
            }
        }
        Some(sample)
    }
}

impl<S: Source> Source for TapSource<S> {
    fn current_span_len(&self) -> Option<usize> {
        self.inner.current_span_len()
    }

    fn channels(&self) -> ChannelCount {
        self.inner.channels()
    }

    fn sample_rate(&self) -> SampleRate {
        self.inner.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.batch.clear();
        self.frame_acc = 0.0;
        self.frame_pos = 0;
        self.inner.try_seek(pos)
    }
}
