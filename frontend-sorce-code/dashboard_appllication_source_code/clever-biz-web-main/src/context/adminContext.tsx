/* eslint-disable @typescript-eslint/no-explicit-any */
import axiosInstance from "@/lib/axios";
import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
} from "react";
import toast from "react-hot-toast";

/* ---------- Types ---------- */
export interface PolicyItem {
  id: number;
  text: string; // ⬅︎ change to `content` if your API uses that
  updated_at?: string;
}
export interface TermsItem {
  id: number;
  text: string; // ⬅︎ change to `content` if your API uses that
  updated_at?: string;
}
export interface FAQ {
  id: number;
  question: string;
  answer: string;
}

interface AdminContextType {
  // Data
  privacyPolicy: PolicyItem[]; // ⬅︎ array (list endpoint)
  termsAndConditions: TermsItem[]; // ⬅︎ array (list endpoint)
  faqs: FAQ[];

  // Flags
  isLoading: boolean;

  // Privacy Policy CRUD
  fetchPrivacyPolicy: () => Promise<void>;
  createPrivacyPolicy: (content: string) => Promise<void>; // ⬅︎ NEW
  updatePrivacyPolicy: (id: number, content: string) => Promise<void>;
  deletePrivacyPolicy: (id: number) => Promise<void>; // ⬅︎ NEW

  // Terms & Conditions CRUD (you already have these; shown for completeness)
  fetchTermsAndConditions: () => Promise<void>;
  createTermsAndConditions: (content: string) => Promise<void>;
  updateTermsAndConditions: (id: number, content: string) => Promise<void>;
  deleteTermsAndConditions: (id: number) => Promise<void>;

  // FAQs
  fetchFAQs: () => Promise<void>;
  createFAQ: (question: string, answer: string) => Promise<void>;
  updateFAQ: (id: number, question: string, answer: string) => Promise<void>;
  deleteFAQ: (id: number) => Promise<void>;
}

export const AdminContext = createContext<AdminContextType | undefined>(
  undefined
);

export const AdminProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  /* ---------- State (arrays for list endpoints) ---------- */
  const [privacyPolicy, setPrivacyPolicy] = useState<PolicyItem[]>([]);
  const [termsAndConditions, setTermsAndConditions] = useState<TermsItem[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  /* ---------- Privacy Policy ---------- */
  const fetchPrivacyPolicy = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axiosInstance.get("/adminapi/policy/");
      setPrivacyPolicy(res.data?.results ?? []);
    } catch (error: any) {
      console.error("Failed to load privacy policy", error);
      if (![401, 403].includes(error.response?.status)) {
        toast.error("Failed to load privacy policy.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createPrivacyPolicy = useCallback(async (content: string) => {
    setIsLoading(true);
    try {
      const { data } = await axiosInstance.post("/adminapi/policy/", {
        text: content, // ⬅︎ change to { content } if required by backend
      });
      setPrivacyPolicy((prev) => [data, ...prev]);
      toast.success("Privacy policy created!");
    } catch (error: any) {
      console.error("Failed to create privacy policy", error);
      toast.error("Failed to create privacy policy.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updatePrivacyPolicy = useCallback(
    async (id: number, content: string) => {
      setIsLoading(true);
      try {
        const { data } = await axiosInstance.patch(`/adminapi/policy/${id}/`, {
          text: content, // ⬅︎ change to { content } if required by backend
        });
        setPrivacyPolicy((prev) => prev.map((p) => (p.id === id ? data : p)));
        toast.success("Privacy policy updated successfully!");
      } catch (error: any) {
        console.error("Failed to update privacy policy", error);
        toast.error("Failed to update privacy policy.");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const deletePrivacyPolicy = useCallback(async (id: number) => {
    setIsLoading(true);
    try {
      await axiosInstance.delete(`/adminapi/policy/${id}/`);
      setPrivacyPolicy((prev) => prev.filter((p) => p.id !== id));
      toast.success("Privacy policy deleted!");
    } catch (error: any) {
      console.error("Failed to delete privacy policy", error);
      toast.error("Failed to delete privacy policy.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* ---------- Terms & Conditions (unchanged from your latest, shown for parity) ---------- */
  const fetchTermsAndConditions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axiosInstance.get("/adminapi/terms-and-conditions/");
      setTermsAndConditions(res.data?.results ?? []);
    } catch (error: any) {
      console.error("Failed to load terms and conditions", error);
      if (![401, 403].includes(error.response?.status)) {
        toast.error("Failed to load terms and conditions.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createTermsAndConditions = useCallback(async (content: string) => {
    setIsLoading(true);
    try {
      const { data } = await axiosInstance.post(
        "/adminapi/terms-and-conditions/",
        {
          text: content,
        }
      );
      setTermsAndConditions((prev) => [data, ...prev]);
      toast.success("Terms and conditions created!");
    } catch (error: any) {
      console.error("Failed to create terms and conditions", error);
      toast.error("Failed to create terms and conditions.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateTermsAndConditions = useCallback(
    async (id: number, content: string) => {
      setIsLoading(true);
      try {
        const { data } = await axiosInstance.patch(
          `/adminapi/terms-and-conditions/${id}/`,
          {
            text: content,
          }
        );
        setTermsAndConditions((prev) =>
          prev.map((t) => (t.id === id ? data : t))
        );
        toast.success("Terms and conditions updated successfully!");
      } catch (error: any) {
        console.error("Failed to update terms and conditions", error);
        toast.error("Failed to update terms and conditions.");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const deleteTermsAndConditions = useCallback(async (id: number) => {
    setIsLoading(true);
    try {
      await axiosInstance.delete(`/adminapi/terms-and-conditions/${id}/`);
      setTermsAndConditions((prev) => prev.filter((t) => t.id !== id));
      toast.success("Terms and conditions deleted!");
    } catch (error: any) {
      console.error("Failed to delete terms and conditions", error);
      toast.error("Failed to delete terms and conditions.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* ---------- FAQs (as you had) ---------- */
  const fetchFAQs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await axiosInstance.get("/adminapi/faq/");
      setFaqs(res.data?.results ?? []);
    } catch (error: any) {
      console.error("Failed to load FAQs", error);
      if (![401, 403].includes(error.response?.status)) {
        toast.error("Failed to load FAQs.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createFAQ = useCallback(async (question: string, answer: string) => {
    setIsLoading(true);
    try {
      const { data } = await axiosInstance.post("/adminapi/faq/", {
        question,
        answer,
      });
      setFaqs((prev) => [...prev, data]);
      toast.success("FAQ created successfully!");
    } catch (error: any) {
      console.error("Failed to create FAQ", error);
      toast.error("Failed to create FAQ.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateFAQ = useCallback(
    async (id: number, question: string, answer: string) => {
      setIsLoading(true);
      try {
        const { data } = await axiosInstance.patch(`/adminapi/faq/${id}/`, {
          question,
          answer,
        });
        setFaqs((prev) => prev.map((f) => (f.id === id ? data : f)));
        toast.success("FAQ updated successfully!");
      } catch (error: any) {
        console.error("Failed to update FAQ", error);
        toast.error("Failed to update FAQ.");
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const deleteFAQ = useCallback(async (id: number) => {
    setIsLoading(true);
    try {
      await axiosInstance.delete(`/adminapi/faq/${id}/`);
      setFaqs((prev) => prev.filter((f) => f.id !== id));
      toast.success("FAQ deleted successfully!");
    } catch (error: any) {
      console.error("Failed to delete FAQ", error);
      toast.error("Failed to delete FAQ.");
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value: AdminContextType = {
    // data
    privacyPolicy,
    termsAndConditions,
    faqs,

    // flags
    isLoading,

    // privacy
    fetchPrivacyPolicy,
    createPrivacyPolicy,
    updatePrivacyPolicy,
    deletePrivacyPolicy,

    // terms
    fetchTermsAndConditions,
    createTermsAndConditions,
    updateTermsAndConditions,
    deleteTermsAndConditions,

    // faqs
    fetchFAQs,
    createFAQ,
    updateFAQ,
    deleteFAQ,
  };

  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within an AdminProvider");
  return ctx;
};
