"""Build a deterministic runtime-only ZIP; no third-party Python modules."""
from pathlib import Path
import hashlib
import json
import struct
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
package = json.loads((root / 'package.json').read_text())
assert manifest['version'] == package['version'], 'Manifest/package versions differ'
assert manifest['manifest_version'] == 3
assert set(manifest['permissions']) == {'tabs', 'storage', 'favicon'}
assert not manifest.get('host_permissions') and not manifest.get('content_scripts')
assert manifest['incognito'] == 'not_allowed'
assert "connect-src 'none'" in manifest['content_security_policy']['extension_pages']
files = [
    'manifest.json', 'background.js', 'core.js', 'early-input.js',
    'popup.html', 'popup.js', 'popup.css', 'tab.svg',
    'options.html', 'options.css', 'options.js', 'theme.js',
    'icons/icon.svg', 'icons/icon-16.png', 'icons/icon-32.png',
    'icons/icon-48.png', 'icons/icon-128.png',
    'icons/icon-dark-16.png', 'icons/icon-dark-32.png', 'icons/icon-dark-48.png', 'icons/icon-dark-128.png',
    'README.md', 'TESTING.md', 'PERFORMANCE.md',
]
for size, name in manifest['icons'].items():
    assert name in files
    data = (root / name).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II', data[16:24]) == (int(size), int(size))
for size in (16, 32, 48, 128):
    name = f'icons/icon-dark-{size}.png'
    assert name in files
    data = (root / name).read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    assert struct.unpack('>II', data[16:24]) == (size, size)
for name in manifest['action']['default_icon'].values():
    assert name in files
assert manifest['background']['service_worker'] in files
assert manifest['options_ui']['page'] in files
output = root / 'dist' / f"Flytab-{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        data = (root / name).read_bytes()
        info = zipfile.ZipInfo('Flytab/' + name, date_time=(2000, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == {'Flytab/' + name for name in files}
    for name in files:
        assert archive.read('Flytab/' + name) == (root / name).read_bytes()
print(f'{output}: {len(files)} verified files, {output.stat().st_size} bytes')
print('SHA-256:', hashlib.sha256(output.read_bytes()).hexdigest())
