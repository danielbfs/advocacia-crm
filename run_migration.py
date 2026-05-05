import paramiko

host = "187.127.29.104"
user = "root"
password = "pW,TS4yrZrAVyOD+y9S8"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

sql = """
-- 1. Add patient_id FK to leads (soft link)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id) ON DELETE SET NULL;

-- 2. Populate patient_id for already-converted leads
UPDATE leads SET patient_id = converted_patient_id WHERE converted_patient_id IS NOT NULL AND patient_id IS NULL;

-- 3. Create patient_contacts for multi-channel support
CREATE TABLE IF NOT EXISTS patient_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL,
    value VARCHAR(255) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(channel, value)
);

-- 4. Seed from existing patients (phone as primary contact)
INSERT INTO patient_contacts (patient_id, channel, value, is_primary)
SELECT id, channel, phone, TRUE FROM patients
WHERE phone IS NOT NULL AND phone != ''
ON CONFLICT (channel, value) DO NOTHING;

-- 5. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_patient_contacts_lookup ON patient_contacts(channel, value);
CREATE INDEX IF NOT EXISTS idx_leads_patient_id ON leads(patient_id);
"""

stdin, stdout, stderr = ssh.exec_command(
    f'docker exec openclinic-db-1 psql -U openclinic -c "{sql.strip()}"'
)
# Use heredoc approach instead
stdin, stdout, stderr = ssh.exec_command(
    "docker exec -i openclinic-db-1 psql -U openclinic",
)
stdin.write(sql)
stdin.channel.shutdown_write()

out = stdout.read().decode()
err = stderr.read().decode()
print("OUT:", out)
print("ERR:", err)
ssh.close()
