import path from 'path';
import type { Configuration } from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';

const isRendererDev = process.env.npm_lifecycle_event === 'dev:renderer' || process.argv.includes('rendererDev=true');

const commonResolve = {
  extensions: ['.ts', '.tsx', '.js', '.json']
};

const mainConfig: Configuration = {
  name: 'main',
  target: 'electron-main',
  mode: isRendererDev ? 'development' : 'production',
  entry: './src/main/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: 'index.js'
  },
  module: {
    rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }]
  },
  resolve: commonResolve,
  node: {
    __dirname: false,
    __filename: false
  }
};

const preloadConfig: Configuration = {
  name: 'preload',
  target: 'electron-preload',
  mode: isRendererDev ? 'development' : 'production',
  entry: './src/main/preload.ts',
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: 'preload.js'
  },
  module: {
    rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }]
  },
  resolve: commonResolve,
  node: {
    __dirname: false,
    __filename: false
  }
};

const rendererConfig: Configuration & { devServer?: Record<string, unknown> } = {
  name: 'renderer',
  target: 'web',
  mode: isRendererDev ? 'development' : 'production',
  entry: './src/renderer/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'renderer.js'
  },
  module: {
    rules: [
      { test: /\.(ts|tsx)$/, use: 'ts-loader', exclude: /node_modules/ },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] }
    ]
  },
  resolve: commonResolve,
  plugins: [
    new HtmlWebpackPlugin({ template: './src/renderer/index.html' }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/assets', to: path.resolve(__dirname, 'dist/assets') },
        { from: 'resources', to: path.resolve(__dirname, 'dist/resources') }
      ]
    })
  ],
  devServer: {
    port: 3000,
    hot: true,
    static: [
      {
        directory: path.resolve(__dirname, 'dist')
      }
    ]
  }
};

export default [mainConfig, preloadConfig, rendererConfig];
