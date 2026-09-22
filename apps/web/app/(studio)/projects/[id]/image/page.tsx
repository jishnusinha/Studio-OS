'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { GenerationPanel } from '@/components/GenerationPanel';
import { projectsApi } from '@/lib/api';

export default function ImageLabPage() {
  const params = useParams<{ id: string }>();
  const projectQuery = useQuery({
    queryKey: ['project', params.id],
    queryFn: () => projectsApi.get(params.id),
  });

  return (
    <GenerationPanel
      projectId={params.id}
      workspaceId={projectQuery.data?.workspaceId}
      capability="image.generate"
      title="Image Lab"
    />
  );
}
