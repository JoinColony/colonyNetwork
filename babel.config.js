const babelConfig = {
  presets: ["@babel/preset-env"],
  plugins: ["istanbul"],
};

module.exports = (babel) => {
  babel.cache.never();
  return babelConfig;
};
