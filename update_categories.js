const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./partnerkino.db');

db.all("SELECT id, category FROM event_slots", (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }

    rows.forEach(row => {
        let newCategory = row.category;
        if (row.category.startsWith('🏃‍♂️ ')) {
            newCategory = row.category.replace('🏃‍♂️ ', '');
        } else if (row.category.startsWith('🎰 ')) {
            newCategory = row.category.replace('🎰 ', '');
        } else if (row.category.startsWith('🎉 ')) {
            newCategory = row.category.replace('🎉 ', '');
        } else if (row.category.startsWith('📚 ')) {
            newCategory = row.category.replace('📚 ', '');
        }

        if (newCategory !== row.category) {
            db.run("UPDATE event_slots SET category = ? WHERE id = ?", [newCategory, row.id], (err) => {
                if (err) console.error(err);
                else console.log(`Updated event ${row.id}: ${row.category} -> ${newCategory}`);
            });
        }
    });
});

db.close();