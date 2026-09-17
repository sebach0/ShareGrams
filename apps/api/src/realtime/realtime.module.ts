import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiagramsModule } from '../diagrams/diagrams.module';
import { AssistantModule } from '../assistant/assistant.module';
import { DiagramGateway } from './diagram.gateway';

@Module({
  imports: [AuthModule, DiagramsModule, AssistantModule],
  providers: [DiagramGateway],
})
export class RealtimeModule {}
