// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

module.exports = {
    target: 'node',
    entry: './src/index.ts',
    mode: 'production',
    devtool: 'nosources-source-map',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'feishu-gpt.js'
    },

    resolve: {
        extensions: ['.js', '.tsx', '.ts']
    },

    module: {
        rules: [
            {
                test: /\.tsx?$/,
                include: path.resolve(__dirname, 'src'),
                loader: 'ts-loader',
                options: {
                    onlyCompileBundledFiles: true,
                    configFile: 'tsconfig.json'
                }
            }
        ]
    },
    externals: {
        'any-promise': 'Promise',
    },
    optimization: {
        minimize: false,
    }
};
