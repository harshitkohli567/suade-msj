const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const devCerts = require("office-addin-dev-certs");

const urlDev = "https://localhost:3100/";

module.exports = async (env, options) => {
  const dev = options.mode === "development";

  const config = {
    devtool: "source-map",
    entry: {
      taskpane: ["./src/taskpane/index.tsx"],
      commands: ["./src/commands/commands.ts"],
    },
    output: {
      clean: true,
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
    },
    resolve: {
      extensions: [".ts", ".tsx", ".html", ".js"],
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: "taskpane.html",
        template: "./src/taskpane/taskpane.html",
        chunks: ["taskpane"],
      }),
      new HtmlWebpackPlugin({
        filename: "commands.html",
        template: "./src/commands/commands.html",
        chunks: ["commands"],
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: "assets/*",
            to: "assets/[name][ext][query]",
          },
          {
            from: "matters-source/*.csv",
            to: "data/[name][ext][query]",
          },
        ],
      }),
    ],
    devServer: {
      static: {
        directory: path.resolve(__dirname, "dist"),
      },
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      server: {
        type: "https",
        options: dev ? await devCerts.getHttpsServerOptions() : {},
      },
      port: 3100,
    },
  };

  return config;
};
