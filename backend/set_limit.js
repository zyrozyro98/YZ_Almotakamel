const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://yz-almotakamel-default-rtdb.firebaseio.com"
    });
}

const rtdb = admin.database();

async function setLimit() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log(`
استخدام الأداة للتحكم في الحد:
--------------------------------
1. لتعيين حد مخصص لرقم معين:
   node set_limit.js <accountId> <limit>
   مثال: node set_limit.js OjAHvuF3X9hW6m8QVhQ6j3kuh6G3 500

2. لتغيير الإعدادات العامة لجميع الأرقام الجديدة:
   node set_limit.js --global <day1_limit> <day3_limit> <day7_limit>
   مثال: node set_limit.js --global 150 250 400

3. لإلغاء الحد المخصص عن رقم معين والرجوع للحد العام:
   node set_limit.js <accountId> reset
        `);
        process.exit(0);
    }

    if (args[0] === '--global') {
        const d1 = parseInt(args[1]) || 100;
        const d3 = parseInt(args[2]) || 200;
        const d7 = parseInt(args[3]) || 300;
        
        await rtdb.ref('settings/anti_ban_limits').set({
            day1: d1,
            day3: d3,
            day7: d7
        });
        console.log(`[نجاح] تم تحديث الحدود العامة إلى: اليوم الأول=${d1}, اليوم الثالث=${d3}, اليوم السابع=${d7}`);
    } else {
        const accountId = args[0];
        const limitValue = args[1];
        
        if (limitValue === 'reset') {
            await rtdb.ref(`wa_status/${accountId}/customLimit`).remove();
            console.log(`[نجاح] تم إلغاء الحد المخصص للحساب ${accountId}. سيرجع إلى النظام العام.`);
        } else {
            const limit = parseInt(limitValue) || 1000;
            await rtdb.ref(`wa_status/${accountId}`).update({
                customLimit: limit
            });
            console.log(`[نجاح] تم تعيين الحد إلى ${limit} للحساب ${accountId}`);
        }
    }
    
    process.exit(0);
}

setLimit();
