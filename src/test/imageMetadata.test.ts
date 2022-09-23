/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { experimentalImageMetadataDefault } from '../spec-node/devContainers';
import { getDevcontainerMetadata, getDevcontainerMetadataLabel, getImageMetadata } from '../spec-node/imageMetadata';
import { ImageDetails } from '../spec-shutdown/dockerUtils';
import { nullLog } from '../spec-utils/log';
import { buildKitOptions, shellExec } from './testUtils';

const pkg = require('../../package.json');

describe('Image Metadata', function () {
	this.timeout('120s');

	const tmp = path.relative(process.cwd(), path.join(__dirname, 'tmp'));
	const cli = `npx --prefix ${tmp} devcontainer`;
	const testFolder = `${__dirname}/configs/image-metadata`;

	before('Install', async () => {
		await shellExec(`rm -rf ${tmp}/node_modules`);
		await shellExec(`mkdir -p ${tmp}`);
		await shellExec(`npm --prefix ${tmp} install devcontainers-cli-${pkg.version}.tgz`);
		await shellExec(`docker build -t image-metadata-test-base ${testFolder}/base-image`);
	});
	
	describe('CLI', () => {

		buildKitOptions.forEach(({ text, options }) => {
			it(`should collect metadata on image label  [${text}]`, async () => {
				if (!experimentalImageMetadataDefault) {
					return;
				}
				const buildKitOption = (options?.useBuildKit ?? false) ? '' : ' --buildkit=never';
				const res = await shellExec(`${cli} build --workspace-folder ${testFolder} --image-name image-metadata-test${buildKitOption}`);
				const response = JSON.parse(res.stdout);
				assert.strictEqual(response.outcome, 'success');
				const details = JSON.parse((await shellExec(`docker inspect image-metadata-test`)).stdout)[0] as ImageDetails;
				const metadata = getImageMetadata(details, true, nullLog);
				assert.strictEqual(metadata.length, 3);
				assert.strictEqual(metadata[0].id, 'baseFeature');
				assert.strictEqual(metadata[1].id, 'localFeatureA');
				assert.strictEqual(metadata[1].init, true);
				assert.strictEqual(metadata[2].id, 'localFeatureB');
				assert.strictEqual(metadata[2].privileged, true);
			});
		});
	});

	describe('Utils', () => {
		it('should collect metadata from devcontainer.json and features', () => {
			const metadata = getDevcontainerMetadata({
				configFilePath: URI.parse('file:///devcontainer.json'),
				image: 'image',
				remoteUser: 'testUser',
			}, [
				{
					id: 'someFeature',
					value: 'someValue',
					included: true,
				}
			]);
			assert.strictEqual(metadata.length, 2);
			assert.strictEqual(metadata[0].id, 'someFeature');
			assert.strictEqual(metadata[1].remoteUser, 'testUser');
		});

		it('should create label for Dockerfile', () => {
			const label = getDevcontainerMetadataLabel([
				{
					id: 'baseFeature',
				}
			], {
				configFilePath: URI.parse('file:///devcontainer.json'),
				image: 'image',
				remoteUser: 'testUser',
			}, [
				{
					id: 'someFeature',
					value: 'someValue',
					included: true,
				}
			], true);
			const expected = [
				{
					id: 'baseFeature',
				},
				{
					id: 'someFeature',
				},
				{
					remoteUser: 'testUser',
				}
			];
			assert.strictEqual(label.replace(/ \\\n/g, ''), `LABEL devcontainer.metadata="${JSON.stringify(expected).replace(/"/g, '\\"')}"`);
		});
	});
});