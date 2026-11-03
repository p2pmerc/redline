//! Outbound HTTPS from inside the worker. On the WASI target this uses the host's HTTP; on a native build
//! (unit tests) every request is refused so tests never touch the network.

#[cfg_attr(not(target_os = "wasi"), allow(dead_code))]
pub struct Header<'a>(pub &'a str, pub &'a str);

pub trait HttpFetcher {
    /// Returns `(status, body)`.
    fn get(&self, url: &str, headers: &[Header]) -> Result<(u16, Vec<u8>), String>;
    fn post_json(&self, url: &str, body: &str) -> Result<(u16, Vec<u8>), String>;
}

pub struct HostHttp;

#[cfg(target_os = "wasi")]
impl HttpFetcher for HostHttp {
    fn get(&self, url: &str, headers: &[Header]) -> Result<(u16, Vec<u8>), String> {
        use std::time::Duration;
        let mut request = wasi_http_client::Client::new()
            .get(url)
            .header("User-Agent", "redline-enclave/0.1")
            .header("Accept-Encoding", "identity");
        for Header(name, value) in headers {
            request = request.header(*name, *value);
        }
        let response = request
            .connect_timeout(Duration::from_secs(8))
            .send()
            .map_err(|e| format!("request failed: {e}"))?;
        let status = response.status();
        let body = response.body().map_err(|e| e.to_string())?;
        Ok((status, body))
    }

    fn post_json(&self, url: &str, body: &str) -> Result<(u16, Vec<u8>), String> {
        use std::time::Duration;
        let response = wasi_http_client::Client::new()
            .post(url)
            .header("User-Agent", "redline-enclave/0.1")
            .header("Content-Type", "application/json")
            .header("Accept-Encoding", "identity")
            .connect_timeout(Duration::from_secs(8))
            .body(body.as_bytes())
            .send()
            .map_err(|e| format!("request failed: {e}"))?;
        let status = response.status();
        let body = response.body().map_err(|e| e.to_string())?;
        Ok((status, body))
    }
}

#[cfg(not(target_os = "wasi"))]
impl HttpFetcher for HostHttp {
    fn get(&self, _: &str, _: &[Header]) -> Result<(u16, Vec<u8>), String> {
        Err("network is only available inside the worker".into())
    }
    fn post_json(&self, _: &str, _: &str) -> Result<(u16, Vec<u8>), String> {
        Err("network is only available inside the worker".into())
    }
}
