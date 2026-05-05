import paramiko
import sys
import time
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def run_cmd(ssh, cmd, label=None, timeout=60):
    label = label or cmd
    print(f"\n{'='*60}")
    print(f">>> {label}")
    print(f"{'='*60}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out.strip():
        print(out)
    if err.strip():
        print(f"[STDERR] {err}")
    return out.strip()

def main():
    host = "187.127.29.104"
    user = "root"
    password = "pW,TS4yrZrAVyOD+y9S8"

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)

    # 1. Stash and pull (just in case)
    run_cmd(ssh, "cd /docker/openclinic && git stash && git pull origin main", "Git pull")

    # 2. Hard reset containers
    print("Stopping containers...")
    run_cmd(ssh, "cd /docker/openclinic && docker compose down", "Docker Compose Down", timeout=120)
    
    print("Rebuilding and starting...")
    run_cmd(ssh, "cd /docker/openclinic && docker compose up -d --build", "Docker Compose Up Build", timeout=300)

    time.sleep(10)

    # Check backend logs
    print("Checking backend logs...")
    stdin, stdout, stderr = ssh.exec_command("docker logs --tail=100 openclinic-backend-1")
    print(stdout.read().decode())
    print(stderr.read().decode())
    
    # 3. Final verification of the endpoint
    run_cmd(ssh, "docker exec openclinic-backend-1 curl -s http://localhost:8000/api/v1/messaging/conversations", "Final API Verification")

    ssh.close()
    print("\n\nReset Complete. Please test now!")

if __name__ == "__main__":
    main()

