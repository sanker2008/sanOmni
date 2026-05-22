const fs = require('fs');
const buffer = fs.readFileSync('D:/dev/san/watermelon/public/bg_48.png');
// We need to decode the PNG. 
// Without a library, we can just print the header.
// Actually, let's just write a test in Rust in the project.
