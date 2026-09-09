import axios from "axios";
import type { Task, TaskDetails, SubmissionStatus, SubmitTaskResponse} from "../../../utils/individualTask.type";

export const api = axios.create({
    baseURL: `${import.meta.env.VITE_SERVER_LINK}/api`,
    withCredentials: true,
    headers: {"Content-Type": "application/json"}
})

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

//can improve this because it is sending the whole task data, we can only fetch which is to be displayed
//there is a separate api for fetching task details.
export const getAllTasks = async (): Promise<Task[]> => {
    try {
        const response = await api.get<Task[]>("/tasks/all");
        return response.data;
    } catch (error) {
        console.error("Error fetching tasks:", error);
        throw error;
    }
}

export const getTaskDetails = async (taskId: string): Promise<TaskDetails> => {
    try {
        const response = await api.get<TaskDetails>(`/tasks/${taskId}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching task details:", error);
        throw error;
   } 
}

export const getDailyTasks = async (): Promise<TaskDetails> => {
    try {
        const response = await api.get<TaskDetails>("/tasks/daily");
        return response.data;
    } catch (error) {
        console.error("Error fetching daily tasks:", error);
        throw error;
    }
}

export const startTask = async (taskId: string): Promise<{ status: SubmissionStatus }> => {
    try {
        const response = await api.post(`/tasks/${taskId}/start`);
        return response.data;
    } catch (error) {
        console.error("Error starting task:", error);
        throw error;
    }
}

export const getStatus = async (taskId: string): Promise<{ status: SubmissionStatus | "NOT_STARTED" }> => {
    try {
        const response = await api.get(`/tasks/${taskId}/status`);
        return response.data;
    } catch (error) {
        console.error("Error fetching task status:", error);
        throw error;
    }   
}

export const SubmitTaskEvidence = async (
  taskId: string,
  data: {
    evidenceUrls?: string[];
    textResponse?: string;
    mcqAnswer?: string;
  }): Promise<SubmitTaskResponse> => {
  try {
    const res = await api.post(`/tasks/${taskId}/submit`, data);
    return res.data;
  } catch (error) {
    console.error("Error submitting task evidence:", error);
    throw error;
  }
};