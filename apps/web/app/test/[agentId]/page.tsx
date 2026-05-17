import TestAgentClient from "./test-client";

interface PageProps {
  params: Promise<{ agentId: string }>;
}

export default async function TestAgentPage({ params }: PageProps) {
  const { agentId } = await params;
  return <TestAgentClient agentId={agentId} />;
}
