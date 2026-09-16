import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiagramsModule } from '../diagrams/diagrams.module';
import { DiagramGateway } from './diagram.gateway';

@Module({
  imports: [AuthModule, DiagramsModule],
  providers: [DiagramGateway],
})
export class RealtimeModule {}
