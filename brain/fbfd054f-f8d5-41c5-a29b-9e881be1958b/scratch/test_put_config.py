import requests
import json

base_url = "https://clinica.sigame.tec.br/api/v1"
login_url = f"{base_url}/auth/login"

# Login as admin
resp = requests.post(login_url, data={"username": "admin", "password": "password"}) # default password or current one?
if resp.status_code != 200:
    print(f"Login failed: {resp.status_code} {resp.text}")
    exit(1)

token = resp.json()["access_token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Try to save 'novo' config
config = {
    "status": "novo",
    "is_active": True,
    "system_prompt": "Prompt de teste para NOVO",
    "auto_send_on_enter": True,
    "initial_message": "Ola novo lead",
    "inactivity_hours": 24,
    "max_inactivity_followups": 2,
    "inactivity_followup_message": "Ainda ai?",
    "auto_lost_after_hours": 72
}

put_url = f"{base_url}/leads/ai-configs/novo"
print(f"Sending PUT to {put_url}")
resp = requests.put(put_url, headers=headers, json=config)
print(f"Status: {resp.status_code}")
print(f"Response: {resp.text}")
