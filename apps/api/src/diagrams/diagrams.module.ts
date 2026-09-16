import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DiagramsService } from './diagrams.service';
import { DiagramsController } from './diagrams.controller';

@Module({
  imports: [AuthModule],
  controllers: [DiagramsController],
  providers: [DiagramsService],
  exports: [DiagramsService],
})
export class DiagramsModule {}
