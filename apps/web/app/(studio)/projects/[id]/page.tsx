'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ShotBoard } from '@/components/ShotBoard';
import { projectsApi, asNumber } from '@/lib/api';
import { useStudioStore } from '@/lib/store';

export default function ProjectHomePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const setProject = useStudioStore((s) => s.setProject);
  const setSpend = useStudioStore((s) => s.setSpend);

  const projectQuery = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  useEffect(() => {
    if (projectQuery.data) {
      setProject(projectQuery.data.id, projectQuery.data.name);
      setSpend(asNumber(projectQuery.data.spentUsd), asNumber(projectQuery.data.budgetUsd) || null);
    }
  }, [projectQuery.data, setProject, setSpend]);

  return <ShotBoard projectId={projectId} />;
}
