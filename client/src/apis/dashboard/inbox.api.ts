import axios from "axios"


// Creating a Axios instance.
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_SERVER_LINK}/api/ngo`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" }
})


// Attach auth token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("authToken");
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)


// Global error normalization. Handles errors in one place, instead of repeating try/catch everywhere.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.response?.data || error.message || "Something went wrong"
    return Promise.reject(new Error(message))
  }
)

export const getMyInvitations = async () => {
    const response = await api.get("/invitations/me")
    return response.data.data
}

export const acceptInvitation =
async (
  invitationId: string
) => {

  return api.patch(
    `/${invitationId}/accept`
  );
};

export const rejectInvitation =
async (
  invitationId: string
) => {

  return api.patch(
    `/${invitationId}/reject`
  );
};