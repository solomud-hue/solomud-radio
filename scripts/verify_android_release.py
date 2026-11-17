#!/usr/bin/env python3
"""Reject an APK with the wrong identity, signer, or non-increasing version."""
import argparse
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
LEGACY_SIGNER = '10de657e6911650c52f421c7ac4c5aa51477cf3b9bac905224c7f4bce082fd72'


def inspect(apk, apksigner, aapt):
    signature = subprocess.check_output([apksigner, 'verify', '--print-certs', str(apk)], text=True)
    signers = re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-f]+)', signature)
    if len(signers) != 1:
        raise ValueError('Expected exactly one APK signing certificate')
    badging = subprocess.check_output([aapt, 'dump', 'badging', str(apk)], text=True)
    package = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not package:
        raise ValueError('Cannot read APK package metadata')
    return dict(package=package[1], code=int(package[2]), version=package[3], signer=signers[0],
                debug=bool(re.search(r'^application-debuggable', badging, re.M)))


def validate(candidate, expected_signer, previous=None, allow_migration=False):
    if candidate['package'] != 'md.solomud.radio':
        raise ValueError('Application ID changed')
    if candidate['signer'] != expected_signer:
        raise ValueError('Signing certificate differs from the permanent release key')
    if candidate['debug']:
        raise ValueError('A debuggable APK must not be distributed')
    if previous:
        if previous['package'] != candidate['package']:
            raise ValueError('Previous APK belongs to another application')
        if candidate['code'] <= previous['code']:
            raise ValueError('versionCode must increase for each published update')
        if previous['signer'] != candidate['signer']:
            migration = (allow_migration and previous['signer'] == LEGACY_SIGNER
                         and previous['code'] == 3 and candidate['code'] == 4)
            if not migration:
                raise ValueError('Update signature mismatch: refuse publication')
            return 'ONE-TIME MIGRATION: 1.1.1 must be uninstalled before installing 1.1.2.'
        return 'Update identity, signature and increasing versionCode verified.'
    return 'Release identity and permanent signing certificate verified.'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('apk', type=pathlib.Path)
    parser.add_argument('--previous', type=pathlib.Path)
    parser.add_argument('--apksigner', default='apksigner')
    parser.add_argument('--aapt', default='aapt')
    parser.add_argument('--allow-legacy-migration', action='store_true')
    args = parser.parse_args()
    expected = (ROOT / 'android/release-certificate.sha256').read_text().strip()
    candidate = inspect(args.apk, args.apksigner, args.aapt)
    previous = inspect(args.previous, args.apksigner, args.aapt) if args.previous else None
    print(validate(candidate, expected, previous, args.allow_legacy_migration))
    print(f"Verified {candidate['package']} {candidate['version']} (code {candidate['code']})")


if __name__ == '__main__':
    main()
