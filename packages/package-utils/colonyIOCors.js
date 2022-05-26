const colonyIOCors = function (req, res, next) {
  const origin = req.get("origin");

  const colonyRegex = /.*colony\.io/;
  const colonyMatches = colonyRegex.exec(origin);

  const localRegex = /http:\/\/(127(\.\d+){1,3}|[0:]+1|localhost)/;

  const localMatches = localRegex.exec(origin);

  if (colonyMatches) {
    res.header("Access-Control-Allow-Origin", colonyMatches[0]);
  } else if (localMatches) {
    res.header("Access-Control-Allow-Origin", "*");
  }
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Synaps-Session-Id");
  next();
};

module.exports = colonyIOCors;
