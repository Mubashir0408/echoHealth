"""Host workaround for project-local --target installs; no global Python changes.

Usage: <python.exe> scripts/dev_python.py <module> [module arguments...]
Normal virtual environments do not need this helper.
"""
from pathlib import Path
import os
import runpy
import site
import sys

root = Path(__file__).resolve().parent.parent
os.chdir(root)
sys.path.insert(0, str(root))
if (root / '.deps').is_dir():
    site.addsitedir(str(root / '.deps'))
    # Package-build subprocesses also need to discover the project-local backend.
    os.environ['PYTHONPATH'] = os.pathsep.join(
        [str(root / '.deps'), str(root)] + ([os.environ['PYTHONPATH']] if os.environ.get('PYTHONPATH') else []))
# LibreOffice's bundled interpreter reports its directory as sys.executable.
if Path(sys.executable).is_dir():
    sys.executable = str(Path(sys.executable).parent / 'python.exe')
if len(sys.argv) < 2:
    raise SystemExit('Usage: dev_python.py module [arguments]')
module = sys.argv.pop(1)
sys.argv[0] = module
runpy.run_module(module, run_name='__main__', alter_sys=True)
