import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('release', Path(__file__).resolve().parents[1] / 'scripts/verify_android_release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseSafety(unittest.TestCase):
    def setUp(self):
        self.old = dict(package='md.solomud.radio', code=4, version='1.1.2', signer='permanent', debug=False)
        self.new = dict(self.old, code=5, version='1.1.3')

    def test_compatible_update(self):
        self.assertIn('verified', release.validate(self.new, 'permanent', self.old))

    def test_reject_broken_update(self):
        for change in [dict(signer='random-debug-key'), dict(package='another.app'), dict(code=4), dict(code=3), dict(debug=True)]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                release.validate(dict(self.new, **change), 'permanent', self.old)

    def test_migration_is_explicit_and_one_time(self):
        legacy = dict(self.old, code=3, signer=release.LEGACY_SIGNER)
        with self.assertRaises(ValueError):
            release.validate(self.old, 'permanent', legacy)
        self.assertIn('ONE-TIME', release.validate(self.old, 'permanent', legacy, True))
        with self.assertRaises(ValueError):
            release.validate(self.new, 'permanent', legacy, True)
        with self.assertRaises(ValueError):
            release.validate(self.old, 'permanent', dict(legacy, signer='unknown'), True)


if __name__ == '__main__':
    unittest.main()
