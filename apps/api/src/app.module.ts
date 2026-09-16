import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { DiagramsModule } from './diagrams/diagrams.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [loadEnv] }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ProjectsModule,
    DiagramsModule,
    RealtimeModule,
  ],
})
export class AppModule {}
