const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'settings.json');

let data = {};
if (fs.existsSync(filePath)) {
    try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        data = {};
    }
}

const settingsDB = new Proxy(data, {
    set(target, key, value) {
        target[key] = value;
        try {
            fs.writeFileSync(filePath, JSON.stringify(target, null, 4));
        } catch (err) {
            console.error("儲存設定失敗:", err);
        }
        return true;
    }
});

module.exports = settingsDB;
