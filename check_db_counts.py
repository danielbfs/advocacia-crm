import paramiko
import sys

def check_db():
    host = "187.127.29.104"
    user = "root"
    password = "pW,TS4yrZrAVyOD+y9S8"

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, username=user, password=password)

    commands = [
        "docker exec openclinic-db-1 psql -U openclinic -c \"SELECT status, is_active, auto_send_on_enter, length(initial_message) as msg_len, length(system_prompt) as prompt_len FROM lead_agent_configs;\""
    ]

    for cmd in commands:
        print(f"Running: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        print(stdout.read().decode())
        print(stderr.read().decode())

    ssh.close()

if __name__ == "__main__":
    check_db()
