"use client";

import { createContext, useContext } from "react";
import type { Project } from "./types";

type ProjectWorkspaceValue = {
  project: Project;
  setProject: (project: Project) => void;
};

const ProjectWorkspaceContext = createContext<ProjectWorkspaceValue | null>(null);

export function ProjectWorkspaceProvider({
  project,
  setProject,
  children,
}: {
  project: Project;
  setProject: (project: Project) => void;
  children: React.ReactNode;
}) {
  return (
    <ProjectWorkspaceContext.Provider value={{ project, setProject }}>{children}</ProjectWorkspaceContext.Provider>
  );
}

export function useProjectWorkspace(): ProjectWorkspaceValue {
  const value = useContext(ProjectWorkspaceContext);
  if (!value) {
    throw new Error("useProjectWorkspace must be used in a project workspace");
  }
  return value;
}
