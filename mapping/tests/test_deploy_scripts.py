import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_scripts_have_valid_syntax():
    for name in ("wrapper.sh", "deploy.sh"):
        subprocess.run(["bash", "-n", str(ROOT / name)], check=True)


def test_deploy_has_rollback_and_backup_and_localhost():
    deploy = (ROOT / "deploy.sh").read_text()
    wrapper = (ROOT / "wrapper.sh").read_text()
    assert "--rollback" in deploy
    assert ".orig" in deploy, "must back up the stock binary before replacing it"
    assert "ROS_LOCALHOST_ONLY=1" in wrapper
    assert "novabot_mapping" in deploy
