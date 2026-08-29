console.log('cwd', process.cwd());
console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('JOB_POSTING_FEE_PERCENT:', process.env.JOB_POSTING_FEE_PERCENT || '(unset)');
console.log('PORT:', process.env.PORT || '(unset)');
console.log('PAYSTACK_SECRET_KEY set:', !!process.env.PAYSTACK_SECRET_KEY);
console.log('SESSION_SECRET set:', !!process.env.SESSION_SECRET);