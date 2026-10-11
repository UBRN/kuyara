// Component suites assert on UTC wall-clock times (the 18:00 evening flip, "06:05" freshness),
// so they run in UTC whichever zone the machine is in or how Jest is started.
module.exports = async () => {
  process.env.TZ = 'UTC';
};
