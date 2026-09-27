"use client";

import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { companyFields, mockAlerts, mockDocuments, peopleFields } from "@/lib/mock-data";
import type { AlertItem, ExtractedField, UploadedDocument } from "@/types/onboarding";

export type CompletionFields = {
  email: string;
  phone: string;
  website: string;
  noWebsite: boolean;
  description: string;
  sourceOfFunds: string;
  annualRevenue: string;
  monthlyVolume: string;
  moneyTransmission: boolean;
  intendedUse: string;
  daoStatus: boolean;
};

type OnboardingContextValue = {
  documents: UploadedDocument[];
  companyFields: ExtractedField[];
  peopleFields: ExtractedField[];
  completion: CompletionFields;
  alerts: AlertItem[];
  explanation: string;
  submitted: boolean;
  setDocuments: Dispatch<SetStateAction<UploadedDocument[]>>;
  updateCompanyField: (id: string, value: string) => void;
  updatePeopleField: (id: string, value: string) => void;
  updateCompletion: (field: keyof CompletionFields, value: string | boolean) => void;
  setExplanation: (value: string) => void;
  setSubmitted: (value: boolean) => void;
};

const initialCompletion: CompletionFields = {
  email: "",
  phone: "",
  website: "",
  noWebsite: false,
  description: "SAIDOU AUTO est spécialisée dans le commerce de véhicules et de pièces détachées au Togo.",
  sourceOfFunds: "sales",
  annualRevenue: "100k",
  monthlyVolume: "",
  moneyTransmission: false,
  intendedUse: "",
  daoStatus: false,
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState(mockDocuments);
  const [companyFieldsState, setCompanyFields] = useState(companyFields);
  const [peopleFieldsState, setPeopleFields] = useState(peopleFields);
  const [completion, setCompletion] = useState(initialCompletion);
  const [explanation, setExplanation] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const value = useMemo<OnboardingContextValue>(() => ({
    documents,
    companyFields: companyFieldsState,
    peopleFields: peopleFieldsState,
    completion,
    alerts: mockAlerts,
    explanation,
    submitted,
    setDocuments,
    updateCompanyField: (id, value) => setCompanyFields((current) => current.map((field) => field.id === id ? { ...field, value } : field)),
    updatePeopleField: (id, value) => setPeopleFields((current) => current.map((field) => field.id === id ? { ...field, value } : field)),
    updateCompletion: (field, value) => setCompletion((current) => ({ ...current, [field]: value })),
    setExplanation,
    setSubmitted,
  }), [completion, documents, explanation, peopleFieldsState, submitted, companyFieldsState]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return context;
}
