const { connectToLocalChrome } = require('./browser');

(async () => {
  const { context } = await connectToLocalChrome();
  const pages = context.pages();
  console.log('Connected!');
  console.log('Contexts: 1');
  for (const page of pages) {
    console.log('Page:', await page.title(), page.url());
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
