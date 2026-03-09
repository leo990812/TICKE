const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'settings.json');

if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 4));
}

let data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const settingsDB = new Proxy(data, {
    set(target, key, value) {
        target[key] = value;
        fs.writeFileSync(filePath, JSON.stringify(target, null, 4));
        return true;
    }
});

module.exports = settingsDB;
