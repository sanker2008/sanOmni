pub fn portable_file_name(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

pub fn creation_record_id(ip_id: &str, image_path: &str) -> String {
    format!("{}|{}", ip_id, portable_file_name(image_path))
}

pub fn split_creation_record_id(record_id: &str) -> Option<(&str, &str)> {
    record_id.split_once('|')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creation_identity_is_independent_of_device_path_format() {
        assert_eq!(
            creation_record_id("ip-1", r"D:\\sanOmni\\ip_archived\\bobo\\front.png"),
            creation_record_id("ip-1", "/data/sanOmni/ip_archived/bobo/front.png")
        );
        assert_eq!(
            creation_record_id("ip-1", "/data/sanOmni/ip_archived/bobo/front.png"),
            "ip-1|front.png"
        );
    }
}
