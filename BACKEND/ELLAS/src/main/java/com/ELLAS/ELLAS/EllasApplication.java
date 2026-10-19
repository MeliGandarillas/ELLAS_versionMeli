package com.ELLAS.ELLAS;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class EllasApplication {

	public static void main(String[] args) {
		SpringApplication.run(EllasApplication.class, args);
	}

}
