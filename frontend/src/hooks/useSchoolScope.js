import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// SCHOOL_ADMIN is always scoped server-side to their own school, so no
// query param is needed. SUPER_ADMIN must pass ?schoolId= explicitly,
// since they can view/manage any school by URL.
export function useSchoolScope() {
  const { schoolId } = useParams();
  const { user } = useAuth();
  const params = user.role === "SUPER_ADMIN" ? { schoolId } : undefined;
  return { schoolId, params };
}
