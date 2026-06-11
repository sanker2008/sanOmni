use keyring::Entry;

#[tokio::main]
async fn main() {
    let api_key = Entry::new("sanomni-sync", "api_key").unwrap().get_password().unwrap();
    let url = "https://sanip.lailiho.cn/api/sync/pull?since_version=0";
    let client = reqwest::Client::new();
    let resp = client.get(url).header("Authorization", format!("Bearer {}", api_key)).send().await.unwrap();
    let json: serde_json::Value = resp.json().await.unwrap();
    std::fs::write("out2.json", serde_json::to_string_pretty(&json).unwrap()).unwrap();
}
