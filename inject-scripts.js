const fs = require('fs');
const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
files.forEach(f => {
    let c = fs.readFileSync(f, 'utf8');
    if (!c.includes('image-utils.js')) {
        c = c.replace('</body>', '<script src="image-utils.js"></script>\n</body>');
        fs.writeFileSync(f, c);
        console.log('Updated ' + f);
    }
});
