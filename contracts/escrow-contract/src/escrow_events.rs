//! Structured log lines (NEP-297 style) so an indexer can rebuild the timeline of a report.

use near_sdk::env;
use near_sdk::serde_json::{json, Value};

pub fn emit(event: &str, data: Value) {
    let line = json!({
        "standard": "redline",
        "version": "1.0.0",
        "event": event,
        "data": data,
    });
    env::log_str(&format!("EVENT_JSON:{line}"));
}
