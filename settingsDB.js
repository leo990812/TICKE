const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'settings.json');

// 初始讀取
let data = {};
if (fs.existsSync(filePath)) {
    try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        data = {};
    }
}

// 使用 Proxy 監聽變動，自動存檔
const settingsDB = new Proxy(data, {
    set(target, key, value) {
        target[key] = value;
        fs.writeFileSync(filePath, JSON.stringify(target, null, 4));
        return true;
    }
});

module.exports = settingsDB;
