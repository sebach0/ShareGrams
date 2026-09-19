import { toPascalCase } from '../naming';

export function mainClassName(projectName: string): string {
  return `${toPascalCase(projectName)}Application`;
}

export function renderMainClass(packageName: string, projectName: string): string {
  const className = mainClassName(projectName);
  return `package ${packageName};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ${className} {

    public static void main(String[] args) {
        SpringApplication.run(${className}.class, args);
    }
}
`;
}
