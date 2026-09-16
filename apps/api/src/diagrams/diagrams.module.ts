import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { DiagramsService } from './diagrams.service';
import { DiagramsController } from './diagrams.controller';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [DiagramsController],
  providers: [DiagramsService],
  exports: [DiagramsService],
})
export class DiagramsModule {}
