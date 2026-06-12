const fs = require('fs');
const path = require('path');
const { NtExecutable, NtExecutableResource, Resource, Data } = require('resedit');

const PRODUCT_NAME_EXE = 'patent-assistant';
const PRODUCT_NAME_ZH = '专利撰写助手';
const PRODUCT_NAME_EN = 'Patent Assistant';

function parseVersionParts(version) {
  const parts = String(version || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    build: parts[3] || 0,
    string: `${parts[0] || 0}.${parts[1] || 0}.${parts[2] || 0}.${parts[3] || 0}`,
  };
}

function applyVersionInfo(resource, { productName, version, description }) {
  const infos = Resource.VersionInfo.fromEntries(resource.entries);
  let vi = infos[0];
  if (!vi) {
    vi = Resource.VersionInfo.create({
      lang: 1033,
      fixedInfo: {
        fileType: Resource.VersionFileType.APPLICATION,
        fileOS: Resource.VersionFileOS.WINDOWS32,
      },
      strings: [{ lang: 1033, codepage: 1200, values: {} }],
    });
  }

  const ver = parseVersionParts(version);
  vi.setFileVersion(ver.major, ver.minor, ver.patch, ver.build, 1033);
  vi.setProductVersion(ver.major, ver.minor, ver.patch, ver.build, 1033);

  const lang = { lang: 1033, codepage: 1200 };
  const values = {
    FileDescription: description || productName,
    ProductName: productName,
    InternalName: productName,
    OriginalFilename: `${productName}.exe`,
    CompanyName: 'Patent Team',
    LegalCopyright: 'Copyright (C) Patent Team',
    FileVersion: ver.string,
    ProductVersion: ver.string,
  };
  vi.setStringValues(lang, values, true);
  vi.outputToResourceEntries(resource.entries);
}

function applyIcon(resource, iconPath) {
  if (!iconPath || !fs.existsSync(iconPath)) return 0;
  const iconFile = Data.IconFile.from(fs.readFileSync(iconPath));
  const icons = iconFile.icons.map((item) => item.data);
  if (!icons.length) return 0;
  Resource.IconGroupEntry.replaceIconsForResource(resource.entries, 1, 1033, icons);
  Resource.IconGroupEntry.replaceIconsForResource(resource.entries, 1, 0, icons);
  return icons.length;
}

/**
 * Embed icon + version metadata so Explorer / Task Manager show the product name.
 */
function embedExeBranding(exePath, options = {}) {
  const pkg = require(path.join(__dirname, '..', 'package.json'));
  const productName = options.productName || PRODUCT_NAME_EXE;
  const version = options.version || pkg.version || '0.0.0';
  const description = options.description || PRODUCT_NAME_ZH;
  const iconPath = options.iconPath || path.join(__dirname, 'icon.ico');

  const exeBuf = fs.readFileSync(exePath);
  const executable = NtExecutable.from(exeBuf);
  const resource = NtExecutableResource.from(executable);

  const iconCount = applyIcon(resource, iconPath);
  applyVersionInfo(resource, { productName, version, description });

  resource.outputResource(executable);
  fs.writeFileSync(exePath, Buffer.from(executable.generate()));

  return { iconCount, productName, version, fileDescription: description };
}

module.exports = {
  embedExeBranding,
  PRODUCT_NAME_EXE,
  PRODUCT_NAME_ZH,
  PRODUCT_NAME_EN,
};
