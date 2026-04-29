import { PatientDetailView } from "@/app/secretary/patients/[id]/page";

export default function AdminPatientDetailPage() {
  return <PatientDetailView backPath="/admin/patients" />;
}
